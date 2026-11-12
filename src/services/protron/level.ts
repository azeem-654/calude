/**
 * The loudness of Protron's voice, 0–1, while it speaks.
 *
 * Its own module so the face (ProtronAvatar, also drawn in the wizard's
 * chunk) can follow the voice without importing the voice code. The speaker
 * measures what is really playing (an analyser on the audio, or the browser
 * voice's word boundaries) and the mouth is drawn from that — never from a
 * timer, which is how a talking face ends up moving when nothing is heard.
 */
type LevelFn = (level: number) => void;
const listeners = new Set<LevelFn>();

/** Called about sixty times a second while a voice plays; 0 when it stops. */
export function onVoiceLevel(fn: LevelFn): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitVoiceLevel(v: number): void {
  listeners.forEach(fn => fn(v));
}
