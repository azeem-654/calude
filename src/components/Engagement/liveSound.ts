/**
 * What Live help's two ends share that is not a component: whether this
 * browser can choose a speaker, the ring an incoming call makes (one sound for
 * the Live help screen and the app-wide alert, so they cannot differ), and how
 * a call's length is written.
 */
import { useEffect } from 'react';

/* Choosing a speaker needs HTMLMediaElement.setSinkId — Chrome and Edge, not
   Safari. Where it is missing the choice is not drawn at all. */
export const canPickSpeaker = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/* ── The ring ─────────────────────────────────────────────────────────────── */

/**
 * Ring while `on`. Two short tones, made here rather than fetched, repeating
 * every three seconds. A browser that has not yet seen a press on this page
 * may keep the sound off; the visible alert is the part that always works.
 */
export function useRinger(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext | null = null;
    let timer = 0;
    try {
      ctx = new AC();
      const c = ctx;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(c.destination);
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = 660;
      o.connect(g);
      o.start();
      const beat = () => {
        const t = c.currentTime;
        g.gain.setValueAtTime(0.06, t);
        g.gain.setValueAtTime(0, t + 0.25);
        g.gain.setValueAtTime(0.06, t + 0.4);
        g.gain.setValueAtTime(0, t + 0.65);
      };
      beat();
      timer = window.setInterval(beat, 3000);
    } catch { /* no sound; the alert still shows */ }
    return () => {
      window.clearInterval(timer);
      void ctx?.close().catch(() => undefined);
    };
  }, [on]);
}

export const callClock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
