/**
 * Protron's voice out: reading a reply aloud.
 *
 * ── What this is, honestly ──
 *
 * Turn-based voice, not a live duplex call. The customer speaks; the take is
 * transcribed (the same recorder and server transcriber the Autopilot box
 * uses — Autopilot/voice/useVoiceInput.ts); Protron answers in text; that text
 * is read aloud here by the browser's own speech engine. Pressing the
 * microphone, Stop or typing interrupts it at once.
 *
 * A realtime speech-to-speech session (OpenAI Realtime over WebRTC, or
 * Gemini Live) would cut the pause between turns to a few hundred
 * milliseconds and let the customer talk over Protron mid-sentence. It needs
 * a provider key on the install and a server-minted ephemeral token, neither
 * of which exists today, so it is not pretended: the `Speaker` interface below
 * is the seam a realtime provider would plug into, and the panel already
 * labels this mode "Voice (turn by turn)".
 *
 * The browser voice is free, private (nothing leaves the device on most
 * systems) and works offline; its quality depends on the device.
 */
export interface Speaker {
  readonly name: string;
  supported(): boolean;
  /** Speaks the text; resolves when it finishes or is stopped. */
  speak(text: string, onBoundary?: () => void): Promise<void>;
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
  speak(text: string, onBoundary?: () => void): Promise<void> {
    return new Promise(resolve => {
      if (!this.supported()) { resolve(); return; }
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      const v = pickVoice(synth);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 1.03;
      u.pitch = 0.95;
      u.onboundary = () => onBoundary?.();
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  },
};
