/**
 * Speaking instead of typing — and being understood.
 *
 * ── What was wrong with the old one ──
 *
 * `VoicePrompt` handed everything to the browser's recogniser and appended
 * whatever came back. Four things made it mishear:
 *
 *   1. It was told `lang = "en"` (the page's own attribute), which Chrome
 *      decodes against its US model. A British, Indian, Pakistani, Nigerian or
 *      Australian speaker was being heard as an American who kept saying the
 *      wrong word.
 *   2. No interim results, so nobody could see it going wrong until the words
 *      were already in the box.
 *   3. No restart when Chrome ended the session. Chrome stops after a few
 *      seconds of silence, so a natural pause ended the recording and the rest
 *      of the sentence was never heard.
 *   4. Android repeats itself in continuous mode — each result is the whole
 *      utterance so far — so appending finals duplicated phrases.
 *
 * ── What this does instead ──
 *
 * Two listeners at once, on one microphone stream:
 *
 *   - The browser's recogniser, for the live preview only: interim words in
 *     grey as somebody speaks, restarted across pauses, told the locale the
 *     customer actually speaks. Fast, free, and good enough to show that it is
 *     hearing them.
 *   - A plain recording (16 kHz WAV), sent when they press stop to the
 *     operator's Gemini key — the same key that writes everything else — for a
 *     transcript made from the whole recording, by a multilingual model told
 *     to expect any accent. That is the text that goes in the box.
 *
 * If the transcriber is not available, the browser's text is used and the
 * screen says it is the rougher of the two. If the browser has no recogniser
 * (Firefox), the recording still works and there is simply no live preview.
 *
 * ── What it never does ──
 *
 * Submit. The result is handed to the caller, which puts it in the box and asks
 * the customer to check it. A badly heard command executed without review is
 * the one failure worse than not having a microphone at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribe } from '../../../services/intake';
import { base64, downsample, wavBytes } from './wav';

/* ── The browser recogniser, typed only as far as it is used ── */
interface RecAlt { transcript: string; confidence: number }
interface RecResult { isFinal: boolean; length: number; [i: number]: RecAlt }
interface RecEvent { resultIndex: number; results: { length: number; [i: number]: RecResult } }
interface Recogniser {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecogniserCtor = new () => Recogniser;

function recogniserCtor(): RecogniserCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecogniserCtor; webkitSpeechRecognition?: RecogniserCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export type VoicePhase = 'idle' | 'starting' | 'listening' | 'transcribing' | 'done' | 'error';

export interface VoiceResult {
  text: string;
  /** Who produced the text in the box. */
  engine: 'transcriber' | 'browser';
  /** Worth a second look: the transcriber said so, or the browser was unsure. */
  doubtful: boolean;
  note: string;
}

/* ── Locales ── */

/**
 * The English most people here speak, plus the handful of other languages the
 * product is used in.
 *
 * The browser recogniser needs one of these to be right; the transcriber does
 * not, and is told it only as a hint. So the list matters for the live preview
 * and is forgiving of a wrong pick for the final text.
 */
export const LOCALES: { code: string; label: string }[] = [
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-PK', label: 'English (Pakistan)' },
  { code: 'en-NG', label: 'English (Nigeria)' },
  { code: 'en-ZA', label: 'English (South Africa)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-CA', label: 'English (Canada)' },
  { code: 'en-IE', label: 'English (Ireland)' },
  { code: 'en-NZ', label: 'English (New Zealand)' },
  { code: 'en-PH', label: 'English (Philippines)' },
  { code: 'en-KE', label: 'English (Kenya)' },
  { code: 'en-SG', label: 'English (Singapore)' },
  { code: 'ur-PK', label: 'اردو (Urdu)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'ar-SA', label: 'العربية (Arabic)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
];

/* Not `crm_`-prefixed: it is a fact about this person's voice on this device,
   not about a workspace, and should not change when they switch client. */
const LOCALE_KEY = 'pc_voice_locale';

/**
 * The best first guess at how somebody speaks.
 *
 * The browser's own preference list, first entry that names a region — which is
 * what the operating system was set up with, and a far better signal than the
 * page's `lang="en"`. Only when the browser gives nothing regional does it fall
 * back to British English, the product's own spelling.
 */
export function defaultLocale(): string {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved && LOCALES.some(l => l.code === saved)) return saved;
  } catch { /* private window */ }
  const prefs = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const p of prefs) {
    const exact = LOCALES.find(l => l.code.toLowerCase() === p.toLowerCase());
    if (exact) return exact.code;
  }
  for (const p of prefs) {
    const lang = p.split('-')[0].toLowerCase();
    const near = LOCALES.find(l => l.code.startsWith(`${lang}-`));
    if (near && lang !== 'en') return near.code;
  }
  return 'en-GB';
}

export function rememberLocale(code: string) {
  try { localStorage.setItem(LOCALE_KEY, code); } catch { /* private window */ }
}

/* ── The capture node ── */

/*
 * A worklet that forwards the raw samples, in batches.
 *
 * Loaded from a Blob so it needs no file of its own in the build. Batched to
 * 4096 frames because posting every 128-frame render quantum is 375 messages a
 * second for no benefit.
 */
const TAP = `
class PcTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) { this.buf.push(ch.slice(0)); this.n += ch.length; }
    if (this.n >= 4096) { this.port.postMessage(this.buf); this.buf = []; this.n = 0; }
    return true;
  }
}
registerProcessor('pc-tap', PcTap);
`;

const MAX_SECONDS = 180;
/** Long enough for somebody to think mid-sentence; short enough that a
 *  forgotten microphone does not record the office for three minutes. */
const SILENCE_STOP_SECONDS = 12;
const SPEECH_LEVEL = 0.02;

export function useVoiceInput(locale: string) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState('');
  const [livePreview, setLivePreview] = useState(true);

  const live = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const rate = useRef(48_000);
  const rec = useRef<Recogniser | null>(null);
  const committed = useRef('');
  /** Everything heard so far including words still in flux — read at stop,
   *  when the last phrase may not have been finalised yet. */
  const latest = useRef('');
  const confidences = useRef<number[]>([]);
  const heard = useRef(false);
  const lastSound = useRef(0);
  const startedAt = useRef(0);
  const raf = useRef(0);
  const resolveDone = useRef<((r: VoiceResult | null) => void) | null>(null);
  /* The recogniser restarts itself after every pause; a ref, because a
     callback cannot name itself inside its own definition. */
  const restart = useRef<() => void>(() => undefined);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const hasPreview = !!recogniserCtor();

  const teardown = useCallback(() => {
    live.current = false;
    cancelAnimationFrame(raf.current);
    try { rec.current?.abort(); } catch { /* already gone */ }
    rec.current = null;
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
  }, []);

  /* A microphone left open after the screen has gone keeps its light on with
     nothing to turn it off from. */
  useEffect(() => teardown, [teardown]);

  const startRecogniser = useCallback(() => {
    const C = recogniserCtor();
    if (!C || !live.current) return;
    const r = new C();
    rec.current = r;
    r.lang = locale;
    /* Android repeats the whole utterance in each continuous result, so it is
       run one phrase at a time there and restarted — which is what continuous
       mode does anyway, without the echo. */
    r.continuous = !isAndroid();
    r.interimResults = true;
    r.maxAlternatives = 1;
    let sessionFinal = '';
    r.onresult = e => {
      let interimNow = '';
      sessionFinal = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res[0];
        if (!alt) continue;
        if (res.isFinal) {
          sessionFinal += alt.transcript;
          if (i >= e.resultIndex && alt.confidence > 0) confidences.current.push(alt.confidence);
        } else interimNow += alt.transcript;
      }
      const heardSoFar = `${committed.current} ${sessionFinal}`.replace(/\s+/g, ' ').trim();
      latest.current = `${heardSoFar} ${interimNow}`.replace(/\s+/g, ' ').trim();
      setFinalText(heardSoFar);
      setInterim(interimNow.trim());
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        /* The recording has the microphone; only the preview was refused
           (Chrome refuses the recogniser on some managed devices). Carry on. */
        setLivePreview(false);
      } else if (e.error === 'network' || e.error === 'language-not-supported') {
        setLivePreview(false);
      }
      /* 'no-speech' and 'aborted' are ordinary during a pause; onend restarts. */
    };
    r.onend = () => {
      committed.current = `${committed.current} ${sessionFinal}`.replace(/\s+/g, ' ').trim();
      sessionFinal = '';
      setInterim('');
      /* Chrome ends a session on a pause. Somebody who is still recording has
         not finished talking — so start again, keeping what was heard. */
      if (live.current) window.setTimeout(() => { if (live.current) restart.current(); }, 120);
    };
    try { r.start(); } catch { setLivePreview(false); }
  }, [locale]);
  useEffect(() => { restart.current = startRecogniser; }, [startRecogniser]);

  const finish = useCallback(async (): Promise<VoiceResult | null> => {
    const took = (Date.now() - startedAt.current) / 1000;
    const sampleRate = rate.current;
    const recorded = chunks.current;
    const browserText = latest.current.trim() || committed.current.trim();
    const conf = confidences.current;
    teardown();
    setLevel(0);

    if (!heard.current || took < 0.6) {
      setPhase('error');
      setProblem('I couldn’t hear that clearly. Try again, a little closer to the microphone.');
      return null;
    }

    setPhase('transcribing');
    const wav = wavBytes(downsample(recorded, sampleRate));
    const t = await transcribe(base64(wav), 'audio/wav', locale);
    const text = t.ok ? t.text.trim() : '';

    if (text && t.clarity !== 'unclear') {
      setFinalText(text);
      setPhase('done');
      return {
        text, engine: 'transcriber', doubtful: t.clarity !== 'clear' || text.includes('[unclear]'),
        note: t.clarity === 'clear' ? 'I heard this — please check it before continuing.'
          : 'Some of it was hard to make out, marked [unclear]. Please check it before continuing.',
      };
    }
    if (browserText) {
      const avg = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : 0.6;
      setFinalText(browserText);
      setPhase('done');
      return {
        text: browserText, engine: 'browser', doubtful: true,
        note: t.noAi || !t.ok
          ? `This is your browser’s transcript, which is rougher${avg < 0.7 ? ' — and it was unsure of some words' : ''}. Please check it carefully before continuing.`
          : 'This is the best I could make out. Please check it carefully before continuing.',
      };
    }
    setPhase('error');
    setProblem(t.ok || t.noAi
      ? 'I couldn’t make out any words. Try again — speak at your normal pace, a little closer to the microphone.'
      : `The recording could not be transcribed: ${t.error}`);
    return null;
  }, [locale, teardown]);

  const stop = useCallback(async (): Promise<VoiceResult | null> => {
    if (!live.current) return null;
    const r = await finish();
    resolveDone.current?.(r);
    resolveDone.current = null;
    return r;
  }, [finish]);

  /**
   * Start listening. Resolves when the take is finished — by the caller's
   * `stop`, by the silence limit, or by the length limit — with the text, or
   * null when there was nothing usable.
   */
  const start = useCallback(async (): Promise<VoiceResult | null> => {
    if (live.current) return null;
    setProblem('');
    setFinalText('');
    setInterim('');
    setSeconds(0);
    setLivePreview(true);
    committed.current = '';
    latest.current = '';
    confidences.current = [];
    chunks.current = [];
    heard.current = false;
    setPhase('starting');

    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setPhase('error');
      setProblem(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone permission is required to use voice input. Allow it from the icon in the address bar, then try again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No microphone was found. Plug one in, or type instead.'
          : name === 'NotReadableError'
            ? 'The microphone is being used by another app. Close it and try again.'
            : 'The microphone could not be started. Type instead, or try again.');
      return null;
    }
    stream.current = s;
    live.current = true;

    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    ctx.current = ac;
    rate.current = ac.sampleRate;
    const source = ac.createMediaStreamSource(s);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const mute = ac.createGain();
    mute.gain.value = 0;
    mute.connect(ac.destination);

    let tapped = false;
    if (ac.audioWorklet) {
      try {
        const url = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
        await ac.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ac, 'pc-tap');
        node.port.onmessage = ev => { if (live.current) chunks.current.push(...(ev.data as Float32Array[])); };
        source.connect(node);
        node.connect(mute);
        tapped = true;
      } catch { /* fall back below */ }
    }
    if (!tapped) {
      /* Deprecated but everywhere; only used where worklets are not. */
      const sp = ac.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = ev => { if (live.current) chunks.current.push(new Float32Array(ev.inputBuffer.getChannelData(0))); };
      source.connect(sp);
      sp.connect(mute);
    }

    startedAt.current = Date.now();
    lastSound.current = Date.now();
    setPhase('listening');
    startRecogniser();

    const buf = new Float32Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      if (!live.current) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (rms > SPEECH_LEVEL) { heard.current = true; lastSound.current = Date.now(); }
      /* Fifteen updates a second is smooth enough for a ring and cheap for React. */
      if (++frame % 4 === 0) {
        setLevel(Math.min(1, rms * 8));
        const secs = (Date.now() - startedAt.current) / 1000;
        setSeconds(Math.floor(secs));
        const quiet = (Date.now() - lastSound.current) / 1000;
        if (secs >= MAX_SECONDS || (heard.current && quiet >= SILENCE_STOP_SECONDS)) { void stop(); return; }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return new Promise(res => { resolveDone.current = res; });
  }, [startRecogniser, stop]);

  const cancel = useCallback(() => {
    teardown();
    resolveDone.current?.(null);
    resolveDone.current = null;
    setPhase('idle');
    setInterim('');
    setLevel(0);
  }, [teardown]);

  const reset = useCallback(() => { setPhase('idle'); setProblem(''); setFinalText(''); setInterim(''); }, []);

  return { phase, finalText, interim, level, seconds, problem, livePreview: livePreview && hasPreview, supported, start, stop, cancel, reset };
}
