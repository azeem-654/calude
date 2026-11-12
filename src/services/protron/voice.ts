/**
 * Protron's voice out: reading a reply aloud.
 *
 * ── Three voices ──
 *
 * warm (the default since 2026-11-12, the owner's brief): the same server
 *   speech model with a friendly, clear prebuilt voice and a conversational
 *   direction, played exactly as it arrives — no filter. The brief asked for
 *   a voice that sounds like a confident, friendly business assistant, and a
 *   robot filter is the opposite of "natural". An analyser on the output
 *   drives the face's mouth.
 * commander (a choice in the menu): the reply is spoken by a Gemini speech model on
 *   the server (/api/protron.php `speak` — a deep, slow, resonant direction)
 *   and played here through a robot filter: a touch slower and lower, a ring
 *   modulator for the metal, a short comb delay for the helmet's resonance,
 *   chest boosted, gently clipped and compressed. A heroic giant-robot
 *   leader's voice in the spirit of the brief — its own, not a copy of any
 *   actor's or character's. Each reply spoken is one AI request on the plan.
 * natural: the browser's own speech engine, free and on the device.
 *
 * When the AI voice cannot speak (no Google key — OpenRouter has no speech —
 * an allowance, a busy model, the browser blocking sound) the commander falls
 * back to the browser's deepest voice, pitched down, rather than going
 * silent, and stops asking the server for the rest of the page's life when
 * the answer was "there is no voice here".
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

function deepVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const lang = (navigator.language || 'en-US').slice(0, 2).toLowerCase();
  const voices = synth.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang));
  return voices.find(v => /\b(male|david|daniel|alex|fred|george|guy|james|mark|aaron|arthur|google uk english male)\b/i.test(v.name))
    ?? voices.find(v => /google|natural|neural/i.test(v.name)) ?? voices[0] ?? null;
}

const deepBrowser: Speaker = {
  name: 'Browser voice, deep',
  supported: browserSpeaker.supported,
  speaking: browserSpeaker.speaking,
  stop: browserSpeaker.stop,
  speak(text: string, onStart?: () => void): Promise<void> {
    return new Promise(resolve => {
      if (!this.supported()) { resolve(); return; }
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      const v = deepVoice(synth);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 0.9;
      u.pitch = 0.45;
      u.onstart = () => onStart?.();
      u.onboundary = () => { emit(0.8); window.setTimeout(() => emit(0.2), 120); };
      u.onend = () => { emit(0); resolve(); };
      u.onerror = () => { emit(0); resolve(); };
      synth.speak(u);
    });
  },
};

/* ── The AI voices (warm and commander) ── */

let audio: AudioContext | null = null;
let playing: { src: AudioBufferSourceNode; osc: OscillatorNode | null; done: () => void } | null = null;
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
    playing = { src, osc: null, done };
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

function softClip(amount: number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(amount * x) / Math.tanh(amount); }
  return c;
}

/** Plays the PCM through the robot filter. Resolves when it ends or is stopped. */
function playCommander(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
  return new Promise(resolve => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.94;

    const dry = ctx.createGain(); dry.gain.value = 0.78;
    /* Ring modulation: the voice multiplied by a low sine — the metal. */
    const ring = ctx.createGain(); ring.gain.value = 0;
    const osc = ctx.createOscillator(); osc.frequency.value = 52; osc.connect(ring.gain);
    const ringOut = ctx.createGain(); ringOut.gain.value = 0.32;
    /* A short comb delay with feedback: the resonance inside a helmet. */
    const comb = ctx.createDelay(0.05); comb.delayTime.value = 0.0085;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const combOut = ctx.createGain(); combOut.gain.value = 0.3;
    const chest = ctx.createBiquadFilter(); chest.type = 'lowshelf'; chest.frequency.value = 190; chest.gain.value = 7;
    const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 5200; air.gain.value = -4;
    const clip = ctx.createWaveShaper(); clip.curve = softClip(1.6); clip.oversample = '2x';
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 4;
    const meter = ctx.createAnalyser(); meter.fftSize = 512;

    src.connect(dry); dry.connect(chest);
    src.connect(ring); ring.connect(ringOut); ringOut.connect(chest);
    src.connect(comb); comb.connect(fb); fb.connect(comb); comb.connect(combOut); combOut.connect(chest);
    chest.connect(air); air.connect(clip); clip.connect(comp); comp.connect(meter); meter.connect(ctx.destination);

    let stopMeter = () => undefined as void;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      stopMeter();
      window.clearTimeout(guard);
      try { osc.stop(); } catch { /* not started */ }
      emit(0);
      playing = null;
      resolve();
    };
    /* A context the browser keeps suspended never fires onended: never hang on it. */
    const guard = window.setTimeout(done, (buffer.duration / 0.94) * 1000 + 1500);
    src.onended = done;
    playing = { src, osc, done };
    osc.start();
    src.start();
    stopMeter = meterLoop(meter, 3.2);
  });
}

/**
 * An AI voice: the server speaks it, this browser plays it — clean (warm) or
 * through the robot filter (commander). Falls back to a browser voice when the
 * server cannot speak, and stops asking for the page's life when the answer
 * was "there is no voice here".
 */
function aiSpeaker(style: 'warm' | 'commander'): Speaker {
  const fallback = style === 'warm' ? browserSpeaker : deepBrowser;
  return {
    name: style === 'warm' ? 'Warm voice' : 'Commander voice',
    supported: () => browserSpeaker.supported() || typeof window !== 'undefined' && 'AudioContext' in window,
    speaking: () => !!playing || !!fetching || browserSpeaker.speaking(),
    stop: () => {
      fetching?.abort(); fetching = null;
      if (playing) { try { playing.src.stop(); } catch { /* ended */ } playing.done(); }
      browserSpeaker.stop();
      emit(0);
    },
    async speak(text: string, onStart?: () => void): Promise<void> {
      this.stop();
      const words = speakable(text);
      if (!words) return;
      unlockAudio();
      if (serverVoice !== 'no' && audio) {
        const ctl = new AbortController();
        fetching = ctl;
        const r = await fetchSpeech(words, ctl.signal, style);
        if (fetching !== ctl) return; // stopped while it was being made
        fetching = null;
        if (r.ok) {
          serverVoice = 'yes';
          if (audio.state === 'suspended') await audio.resume().catch(() => undefined);
          if (audio.state === 'running') {
            const buf = pcmToBuffer(audio, r.pcm, r.rate);
            onStart?.();
            await (style === 'warm' ? playClean(audio, buf) : playCommander(audio, buf));
            return;
          }
        } else if (['no_voice', 'no_ai', 'trial_ended'].includes(r.code)) {
          serverVoice = 'no';
        }
      }
      await fallback.speak(words, onStart);
    },
  };
}

export const warmSpeaker: Speaker = aiSpeaker('warm');
export const commanderSpeaker: Speaker = aiSpeaker('commander');

/** Stops every voice — whichever is playing. */
export function stopAllVoices(): void { warmSpeaker.stop(); commanderSpeaker.stop(); browserSpeaker.stop(); }

/** The speaker for a preference. */
export const speakerFor = (voice: Voice): Speaker => (voice === 'natural' ? browserSpeaker : voice === 'commander' ? commanderSpeaker : warmSpeaker);

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
